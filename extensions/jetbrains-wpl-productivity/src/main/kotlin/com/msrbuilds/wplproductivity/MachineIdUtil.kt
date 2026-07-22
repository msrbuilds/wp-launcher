package com.msrbuilds.wplproductivity

import com.intellij.openapi.application.PermanentInstallationID

object MachineIdUtil {

    fun getMachineId(): String {
        return try {
            PermanentInstallationID.get()
        } catch (_: Exception) {
            "unknown"
        }
    }
}
