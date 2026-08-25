---
name: OmniBot Android build runtime
description: Stable build settings for the standalone OmniBot Android checkout in this Replit environment.
---

**Rule:** Run OmniBot Android verification with standard OpenJDK 17 (not GraalVM) and `JAVA_TOOL_OPTIONS='-XX:-UsePerfData -XX:TieredStopAtLevel=1'`; place `GRADLE_USER_HOME` on the workspace disk rather than the home-directory cache. When installing the standalone WebChat dependencies from its nested checkout, use pnpm's workspace-isolation option.

**Why:** GraalVM's `jlink` fails Android Gradle's JDK-image transform for Android API 36, while the home Gradle cache has a smaller quota than the workspace disk. The nested checkout can also be mistaken for the parent pnpm monorepo, leaving WebChat dependencies absent.

**How to apply:** Use the C1-only JVM flags only for the build command, keep SDK and Gradle caches as disposable build inputs, and use a frozen, isolated WebChat install before invoking Android tasks that package the bundle.