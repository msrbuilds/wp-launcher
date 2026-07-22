package com.msrbuilds.wplproductivity

import com.intellij.openapi.project.Project
import java.io.File

object GitUtil {

    fun getBranch(project: Project?): String {
        if (project == null) return ""

        // Try Git4Idea API first (if available)
        try {
            val gitRepoManagerClass = Class.forName("git4idea.repo.GitRepositoryManager")
            val getInstanceMethod = gitRepoManagerClass.getMethod("getInstance", Project::class.java)
            val manager = getInstanceMethod.invoke(null, project)
            val getReposMethod = gitRepoManagerClass.getMethod("getRepositories")
            @Suppress("UNCHECKED_CAST")
            val repos = getReposMethod.invoke(manager) as List<Any>
            if (repos.isNotEmpty()) {
                val repo = repos[0]
                val getBranchMethod = repo.javaClass.getMethod("getCurrentBranch")
                val branch = getBranchMethod.invoke(repo) ?: return ""
                val getNameMethod = branch.javaClass.getMethod("getName")
                return getNameMethod.invoke(branch) as? String ?: ""
            }
        } catch (_: Exception) {
            // Git4Idea not available, fall through to subprocess
        }

        // Fallback: subprocess
        return getBranchFromSubprocess(project.basePath)
    }

    private fun getBranchFromSubprocess(basePath: String?): String {
        if (basePath == null) return ""
        return try {
            val process = ProcessBuilder("git", "rev-parse", "--abbrev-ref", "HEAD")
                .directory(File(basePath))
                .redirectErrorStream(true)
                .start()

            val result = process.inputStream.bufferedReader().readText().trim()
            process.waitFor()
            if (process.exitValue() == 0) result else ""
        } catch (_: Exception) {
            ""
        }
    }
}
