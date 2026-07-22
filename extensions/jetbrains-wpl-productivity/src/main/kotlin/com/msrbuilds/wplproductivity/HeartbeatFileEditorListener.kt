package com.msrbuilds.wplproductivity

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.editor.Document

class HeartbeatFileEditorListener : FileEditorManagerListener, FileDocumentManagerListener {

    // Tab switch / file activated
    override fun selectionChanged(event: FileEditorManagerEvent) {
        val file = event.newFile ?: return
        val project = event.manager.project
        HeartbeatService.getInstance().handleFileEvent(file, project, isWrite = false)
    }

    // File save
    override fun beforeDocumentSaving(document: Document) {
        val file = FileDocumentManager.getInstance().getFile(document) ?: return
        val project = com.intellij.openapi.project.ProjectManager.getInstance().openProjects
            .firstOrNull()
        HeartbeatService.getInstance().handleFileEvent(file, project, isWrite = true)
    }
}
