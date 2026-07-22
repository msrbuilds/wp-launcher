package com.msrbuilds.wplproductivity

import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI

object HttpClient {

    fun postHeartbeats(apiUrl: String, heartbeatsJson: String): Boolean {
        return try {
            val url = URI("$apiUrl/api/productivity/heartbeats").toURL()
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            conn.doOutput = true

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(heartbeatsJson) }

            val code = conn.responseCode
            conn.disconnect()
            code == 200
        } catch (e: Exception) {
            false
        }
    }

    data class TodayStats(
        val totalSeconds: Int = 0,
        val heartbeatCount: Int = 0,
        val goal: Int = 0,
    )

    fun fetchTodayStats(apiUrl: String): TodayStats? {
        return try {
            val url = URI("$apiUrl/api/productivity/stats/today").toURL()
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            if (conn.responseCode != 200) {
                conn.disconnect()
                return null
            }

            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            // Simple JSON parsing (avoid external dependency)
            val totalSeconds = Regex(""""totalSeconds"\s*:\s*(\d+)""").find(body)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            val heartbeatCount = Regex(""""heartbeatCount"\s*:\s*(\d+)""").find(body)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            val goal = Regex(""""goal"\s*:\s*(\d+)""").find(body)?.groupValues?.get(1)?.toIntOrNull() ?: 0

            TodayStats(totalSeconds, heartbeatCount, goal)
        } catch (e: Exception) {
            null
        }
    }
}
