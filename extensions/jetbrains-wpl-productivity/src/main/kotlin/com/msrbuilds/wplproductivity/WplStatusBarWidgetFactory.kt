package com.msrbuilds.wplproductivity

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import java.awt.Component
import java.awt.event.MouseEvent
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.function.Consumer

class WplStatusBarWidgetFactory : StatusBarWidgetFactory {

    override fun getId(): String = "WplProductivity"
    override fun getDisplayName(): String = "WP Launcher Productivity"
    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = WplStatusBarWidget()
}

class WplStatusBarWidget : StatusBarWidget, StatusBarWidget.TextPresentation {

    private var statusBar: StatusBar? = null
    private var text = "WPL: --"
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "WPL-StatusBar-Refresh").apply { isDaemon = true }
    }
    private var refreshTask: ScheduledFuture<*>? = null

    override fun ID(): String = "WplProductivity"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        refresh()
        refreshTask = scheduler.scheduleAtFixedRate(::refresh, 60, 60, TimeUnit.SECONDS)
    }

    override fun getText(): String = text
    override fun getTooltipText(): String = "WP Launcher Productivity \u2014 Click to open dashboard"
    override fun getAlignment(): Float = Component.RIGHT_ALIGNMENT

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
        val apiUrl = SettingsState.getInstance().apiUrl
        try {
            val uri = java.net.URI(apiUrl)
            val dashboardUrl = "${uri.scheme}://${uri.host}/productivity"
            BrowserUtil.browse(dashboardUrl)
        } catch (_: Exception) {
            BrowserUtil.browse("http://localhost/productivity")
        }
    }

    private fun refresh() {
        val stats = HttpClient.fetchTodayStats(SettingsState.getInstance().apiUrl)
        text = if (stats != null) {
            val h = stats.totalSeconds / 3600
            val m = (stats.totalSeconds % 3600) / 60
            if (h == 0) "WPL: ${m}m" else "WPL: ${h}h ${m}m"
        } else {
            "WPL: --"
        }
        statusBar?.updateWidget(ID())
    }

    override fun dispose() {
        refreshTask?.cancel(false)
        scheduler.shutdown()
    }
}
