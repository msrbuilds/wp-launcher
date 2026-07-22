package com.msrbuilds.wplproductivity

import com.intellij.openapi.vfs.VirtualFile

object LanguageUtil {

    private val REMAP = mapOf(
        "javascript" to "javascript",
        "ecmascript 6" to "javascript",
        "typescript" to "typescript",
        "typescript jsx" to "typescriptreact",
        "jsx harmony" to "javascriptreact",
        "php" to "php",
        "python" to "python",
        "java" to "java",
        "kotlin" to "kotlin",
        "groovy" to "groovy",
        "scala" to "scala",
        "go" to "go",
        "rust" to "rust",
        "c" to "c",
        "c++" to "cpp",
        "objective-c" to "objectivec",
        "c#" to "csharp",
        "swift" to "swift",
        "ruby" to "ruby",
        "perl" to "perl",
        "html" to "html",
        "css" to "css",
        "scss" to "scss",
        "sass" to "sass",
        "less" to "less",
        "json" to "json",
        "xml" to "xml",
        "yaml" to "yaml",
        "toml" to "toml",
        "markdown" to "markdown",
        "sql" to "sql",
        "shell script" to "shellscript",
        "dockerfile" to "dockerfile",
        "plain_text" to "plaintext",
        "vue.js" to "vue",
        "dart" to "dart",
        "lua" to "lua",
        "r" to "r",
        "haskell" to "haskell",
        "elixir" to "elixir",
        "erlang" to "erlang",
    )

    fun getLanguage(file: VirtualFile): String {
        val fileTypeName = file.fileType.name.lowercase()
        return REMAP[fileTypeName] ?: fileTypeName.replace(" ", "-")
    }
}
