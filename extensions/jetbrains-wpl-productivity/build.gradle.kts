plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.msrbuilds"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.1")
        bundledPlugin("Git4Idea")
        instrumentationTools()
    }
}

kotlin {
    jvmToolchain(17)
}

intellijPlatform {
    pluginConfiguration {
        id = "com.msrbuilds.wpl-productivity"
        name = "WP Launcher Productivity"
        version = project.version.toString()
        description = """
            Track your coding time automatically across all JetBrains IDEs.
            Sends heartbeats to WP Launcher for productivity monitoring —
            see time by language, project, editor, and more.
        """.trimIndent()
        changeNotes = "Initial release."
        ideaVersion {
            sinceBuild = "241"
        }
        vendor {
            name = "MSR Builds"
            email = "info@msrbuilds.com"
            url = "https://wplauncher.msrbuilds.com"
        }
    }
}
