@echo off
setlocal enabledelayedexpansion

:: wpl — WP Launcher CLI (Windows)
:: Works in PowerShell, cmd, and Windows Terminal

:: Resolve project directory (parent of bin/)
set "PROJECT_DIR=%~dp0.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"

:: Verify project directory
if not exist "%PROJECT_DIR%\docker-compose.yml" (
    echo Error: Could not find WP Launcher project directory.
    echo Set WPL_DIR environment variable to your wp-launcher path.
    exit /b 1
)

:: Load API_PORT from .env
set "API_PORT=3737"
if exist "%PROJECT_DIR%\.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_DIR%\.env") do (
        if "%%A"=="API_PORT" set "API_PORT=%%B"
    )
)

:: Delegate to Node.js CLI if built (supports interactive dashboard)
set "NODE_CLI=%PROJECT_DIR%\packages\cli\dist\index.js"
where node >nul 2>&1
if not errorlevel 1 (
    if exist "%NODE_CLI%" (
        set "WPL_DIR=%PROJECT_DIR%"
        node "%NODE_CLI%" %*
        exit /b %errorlevel%
    )
)

:: Fallback: bash-style commands below
:: Build compose command
set "COMPOSE=docker compose -f "%PROJECT_DIR%\docker-compose.yml""

:: Check for local mode override
if exist "%PROJECT_DIR%\docker-compose.local.yml" (
    findstr /c:"APP_MODE=local" "%PROJECT_DIR%\.env" >nul 2>&1
    if !errorlevel! equ 0 (
        set "COMPOSE=docker compose -f "%PROJECT_DIR%\docker-compose.yml" -f "%PROJECT_DIR%\docker-compose.local.yml""
    )
)

:: Parse command
set "CMD=%~1"
if "%CMD%"=="" set "CMD=help"

:: Remove first argument, keep the rest
shift

:: Commands that need Docker — check and auto-start
if "%CMD%"=="help" goto cmd_help
if "%CMD%"=="--help" goto cmd_help
if "%CMD%"=="-h" goto cmd_help
if "%CMD%"=="dir" goto cmd_dir
if "%CMD%"=="open" goto cmd_open

:: Ensure Docker is running for all other commands
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker is not running. Starting Docker Desktop...
    set "DD_FOUND=0"
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
        set "DD_FOUND=1"
    ) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
        start "" "%LocalAppData%\Docker\Docker Desktop.exe"
        set "DD_FOUND=1"
    )
    if "!DD_FOUND!"=="0" (
        echo Error: Could not find Docker Desktop. Please start it manually.
        exit /b 1
    )
    set /a "_tries=0"
    :wait_docker
    set /a "_tries+=1"
    if !_tries! gtr 30 (
        echo.
        echo Error: Docker did not start in time. Please start Docker Desktop manually.
        exit /b 1
    )
    docker info >nul 2>&1
    if errorlevel 1 (
        <nul set /p "=."
        timeout /t 2 /nobreak >nul
        goto wait_docker
    )
    echo  ready!
)

:: Route commands
if "%CMD%"=="start" goto cmd_start
if "%CMD%"=="stop" goto cmd_stop
if "%CMD%"=="restart" goto cmd_restart
if "%CMD%"=="rebuild" goto cmd_rebuild
if "%CMD%"=="status" goto cmd_status
if "%CMD%"=="ps" goto cmd_status
if "%CMD%"=="logs" goto cmd_logs
if "%CMD%"=="sites" goto cmd_sites
if "%CMD%"=="build:wp" goto cmd_buildwp
if "%CMD%"=="shell" goto cmd_shell
if "%CMD%"=="wp" goto cmd_wp

echo Unknown command: %CMD%
echo Run 'wpl help' for available commands.
exit /b 1

:cmd_start
echo Starting WP Launcher...
%COMPOSE% up -d %1 %2 %3 %4 %5
echo Running at http://localhost
goto :eof

:cmd_stop
echo Stopping WP Launcher...
%COMPOSE% down %1 %2 %3 %4 %5
goto :eof

:cmd_restart
echo Restarting WP Launcher...
%COMPOSE% restart %1 %2 %3 %4 %5
goto :eof

:cmd_rebuild
echo Rebuilding and restarting WP Launcher...
%COMPOSE% up -d --build %1 %2 %3 %4 %5
goto :eof

:cmd_status
%COMPOSE% ps %1 %2 %3 %4 %5
goto :eof

:cmd_logs
%COMPOSE% logs -f %1 %2 %3 %4 %5
goto :eof

:cmd_sites
curl -sf http://localhost:%API_PORT%/api/sites 2>nul
if errorlevel 1 (
    curl -sf http://localhost/api/sites 2>nul
    if errorlevel 1 (
        echo Could not reach API. Is WP Launcher running? ^(wpl start^)
        exit /b 1
    )
)
goto :eof

:cmd_buildwp
echo Building WordPress images (all PHP versions)...
bash "%PROJECT_DIR%\scripts\build-wp-image.sh" %1 %2 %3
goto :eof

:cmd_shell
if "%~1"=="" (
    echo Usage: wpl shell ^<subdomain^>
    echo.
    echo Running WordPress containers:
    docker ps --filter "label=wp-launcher.managed=true" --format "  {{.Names}}"
    exit /b 1
)
echo Opening shell in wp-demo-%~1...
docker exec -it "wp-demo-%~1" bash
goto :eof

:cmd_wp
if "%~1"=="" (
    echo Usage: wpl wp ^<subdomain^> ^<wp-cli command...^>
    echo Example: wpl wp coral-sunset-7x3k plugin list
    echo.
    echo Running WordPress containers:
    docker ps --filter "label=wp-launcher.managed=true" --format "  {{.Names}}"
    exit /b 1
)
set "WP_CONTAINER=%~1"
shift
docker exec -it "wp-demo-%WP_CONTAINER%" wp --allow-root %1 %2 %3 %4 %5 %6 %7 %8 %9
goto :eof

:cmd_open
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=dashboard"
if "%TARGET%"=="dashboard" (
    start http://localhost
) else if "%TARGET%"=="mail" (
    start http://localhost:8025
) else if "%TARGET%"=="mailpit" (
    start http://localhost:8025
) else (
    start http://%TARGET%.localhost
)
goto :eof

:cmd_dir
echo %PROJECT_DIR%
goto :eof

:cmd_help
echo WP Launcher CLI
echo.
echo Usage: wpl ^<command^> [options]
echo.
echo Commands:
echo   start              Start all services
echo   stop               Stop all services
echo   restart            Restart all services
echo   rebuild            Rebuild and restart (after code changes)
echo   status             Show running containers
echo   logs [service]     Tail logs (optionally for a specific service)
echo   sites              List active WordPress sites
echo   open [target]      Open in browser (dashboard, mail, or subdomain)
echo   shell ^<subdomain^>  Open bash shell in a site container
echo   wp ^<subdomain^> ... Run WP-CLI command in a site container
echo   build:wp           Rebuild WordPress images (all PHP versions)
echo   dir                Print WP Launcher project directory
echo   help               Show this help
echo.
echo Examples:
echo   wpl start                          # Start WP Launcher
echo   wpl logs api                       # Tail API logs
echo   wpl open coral-sunset-7x3k         # Open site in browser
echo   wpl wp coral-sunset-7x3k plugin list   # List plugins via WP-CLI
echo   wpl shell coral-sunset-7x3k        # SSH into site container
goto :eof
