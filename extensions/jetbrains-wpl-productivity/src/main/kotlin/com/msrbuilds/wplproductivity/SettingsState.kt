package com.msrbuilds.wplproductivity

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "WplProductivitySettings", storages = [Storage("wpl-productivity.xml")])
class SettingsState : PersistentStateComponent<SettingsState.State> {

    data class State(
        var apiUrl: String = "http://localhost:3737",
        var enabled: Boolean = true,
    )

    private var myState = State()

    val apiUrl: String get() = myState.apiUrl
    val enabled: Boolean get() = myState.enabled

    fun setApiUrl(value: String) { myState.apiUrl = value }
    fun setEnabled(value: Boolean) { myState.enabled = value }

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    companion object {
        fun getInstance(): SettingsState =
            ApplicationManager.getApplication().getService(SettingsState::class.java)
    }
}
