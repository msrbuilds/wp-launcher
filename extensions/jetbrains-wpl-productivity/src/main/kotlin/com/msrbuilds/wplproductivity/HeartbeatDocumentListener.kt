package com.msrbuilds.wplproductivity

import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.ProjectManager

class HeartbeatDocumentListener : DocumentListener {

    override fun documentChanged(event: DocumentEvent) {
        val file = FileDocumentManager.getInstance().getFile(event.document) ?: return
        val project = ProjectManager.getInstance().openProjects.firstOrNull()
        HeartbeatService.getInstance().handleFileEvent(file, project, isWrite = false)
    }
}
