package com.msrbuilds.wplproductivity

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.time.Instant
import java.util.concurrent.*

@Service(Service.Level.APP)
class HeartbeatService : Disposable {

    private val queue = ConcurrentLinkedQueue<Map<String, Any>>()
    private val lastHeartbeats = ConcurrentHashMap<String, Long>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "WPL-Heartbeat-Flush").apply { isDaemon = true }
    }

    @Volatile
    private var consecutiveFailures = 0
    private var currentTask: ScheduledFuture<*>? = null

    companion object {
        private const val DEBOUNCE_MS = 2 * 60 * 1000L
        private const val FLUSH_INTERVAL_MS = 30_000L
        private const val BACKOFF_INTERVAL_MS = 5 * 60 * 1000L
        private const val MAX_QUEUE_SIZE = 500
        private const val MAX_CONSECUTIVE_FAILURES = 5

        fun getInstance(): HeartbeatService =
            ApplicationManager.getApplication().getService(HeartbeatService::class.java)
    }

    init {
        scheduleFlush()
    }

    fun handleFileEvent(file: VirtualFile, project: Project?, isWrite: Boolean) {
        val settings = SettingsState.getInstance()
        if (!settings.enabled) return
        if (file.fileSystem.protocol != "file") return

        val path = file.path
        val now = System.currentTimeMillis()

        if (!isWrite) {
            val last = lastHeartbeats[path]
            if (last != null && now - last < DEBOUNCE_MS) return
        }
        lastHeartbeats[path] = now

        val projectName = project?.name ?: file.parent?.name ?: ""
        val relativePath = project?.basePath?.let { base ->
            if (path.startsWith(base)) path.removePrefix(base).removePrefix("/").removePrefix("\\")
            else file.name
        } ?: file.name

        val heartbeat = mapOf(
            "source" to "editor",
            "entity" to relativePath.replace("\\", "/"),
            "entity_type" to "file",
            "project" to projectName,
            "language" to LanguageUtil.getLanguage(file),
            "editor" to getEditorName(),
            "machine_id" to MachineIdUtil.getMachineId(),
            "branch" to GitUtil.getBranch(project),
            "is_write" to isWrite,
            "time" to Instant.now().toString(),
        )

        queue.add(heartbeat)
        trimQueue()
    }

    private fun getEditorName(): String {
        return try {
            val name = ApplicationInfo.getInstance().fullApplicationName.lowercase()
            when {
                "phpstorm" in name -> "phpstorm"
                "webstorm" in name -> "webstorm"
                "pycharm" in name -> "pycharm"
                "intellij" in name -> "intellij"
                "goland" in name -> "goland"
                "rider" in name -> "rider"
                "clion" in name -> "clion"
                "rubymine" in name -> "rubymine"
                "datagrip" in name -> "datagrip"
                "android studio" in name -> "android-studio"
                else -> "jetbrains"
            }
        } catch (_: Exception) {
            "jetbrains"
        }
    }

    private fun flush() {
        if (queue.isEmpty()) return

        val batch = mutableListOf<Map<String, Any>>()
        while (batch.size < MAX_QUEUE_SIZE) {
            val item = queue.poll() ?: break
            batch.add(item)
        }
        if (batch.isEmpty()) return

        val apiUrl = SettingsState.getInstance().apiUrl
        val json = buildJsonPayload(batch)
        val success = HttpClient.postHeartbeats(apiUrl, json)

        if (success) {
            consecutiveFailures = 0
        } else {
            consecutiveFailures++
            // Put batch back at front (approximate — ConcurrentLinkedQueue has no addFirst)
            val temp = ConcurrentLinkedQueue<Map<String, Any>>()
            temp.addAll(batch)
            temp.addAll(queue)
            queue.clear()
            queue.addAll(temp)
            trimQueue()
        }
    }

    private fun buildJsonPayload(batch: List<Map<String, Any>>): String {
        val sb = StringBuilder()
        sb.append("""{"heartbeats":[""")
        batch.forEachIndexed { i, hb ->
            if (i > 0) sb.append(",")
            sb.append("{")
            sb.append(""""source":"${hb["source"]}",""")
            sb.append(""""entity":"${escapeJson(hb["entity"].toString())}",""")
            sb.append(""""entity_type":"${hb["entity_type"]}",""")
            sb.append(""""project":"${escapeJson(hb["project"].toString())}",""")
            sb.append(""""language":"${hb["language"]}",""")
            sb.append(""""editor":"${hb["editor"]}",""")
            sb.append(""""machine_id":"${hb["machine_id"]}",""")
            sb.append(""""branch":"${escapeJson(hb["branch"].toString())}",""")
            sb.append(""""is_write":${hb["is_write"]},""")
            sb.append(""""time":"${hb["time"]}"""")
            sb.append("}")
        }
        sb.append("]}")
        return sb.toString()
    }

    private fun escapeJson(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")

    private fun trimQueue() {
        while (queue.size > MAX_QUEUE_SIZE) {
            queue.poll()
        }
    }

    private fun scheduleFlush() {
        val interval = if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
            BACKOFF_INTERVAL_MS else FLUSH_INTERVAL_MS

        currentTask = scheduler.schedule({
            flush()
            scheduleFlush()
        }, interval, TimeUnit.MILLISECONDS)
    }

    override fun dispose() {
        currentTask?.cancel(false)
        scheduler.shutdown()
        flush()
    }
}
