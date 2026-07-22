package com.msrbuilds.wplproductivity

import com.intellij.openapi.options.Configurable
import javax.swing.*

class SettingsConfigurable : Configurable {

    private var apiUrlField: JTextField? = null
    private var enabledCheckbox: JCheckBox? = null

    override fun getDisplayName(): String = "WP Launcher Productivity"

    override fun createComponent(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)

        val settings = SettingsState.getInstance()

        val urlPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            add(JLabel("API URL: "))
            apiUrlField = JTextField(settings.apiUrl, 30)
            add(apiUrlField)
        }

        enabledCheckbox = JCheckBox("Enable productivity tracking", settings.enabled)

        panel.add(urlPanel)
        panel.add(Box.createVerticalStrut(10))
        panel.add(enabledCheckbox)
        panel.add(Box.createVerticalGlue())

        return panel
    }

    override fun isModified(): Boolean {
        val settings = SettingsState.getInstance()
        return apiUrlField?.text != settings.apiUrl || enabledCheckbox?.isSelected != settings.enabled
    }

    override fun apply() {
        val settings = SettingsState.getInstance()
        apiUrlField?.text?.let { settings.setApiUrl(it) }
        enabledCheckbox?.isSelected?.let { settings.setEnabled(it) }
    }

    override fun reset() {
        val settings = SettingsState.getInstance()
        apiUrlField?.text = settings.apiUrl
        enabledCheckbox?.isSelected = settings.enabled
    }
}
