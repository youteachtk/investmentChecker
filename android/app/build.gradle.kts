plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "mx.investmentchecker.tablet"
    compileSdk = 35
    defaultConfig {
        // Different ID avoids overwriting an existing APK signed by another CI runner.
        applicationId = "mx.investmentchecker.tablet.v2"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.2.0-overlay"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/order-engine"))
}

// Reuse the *same* audited proposal algorithm as Brave; only its pure functions.
// Broker UI, order-preparation and extension APIs are excluded from Android.
val generateOrderEngine by tasks.registering {
    val input = rootProject.file("../browser/brave-extension/order-preflight.js")
    val output = layout.buildDirectory.file("generated/order-engine/order-engine.js")
    inputs.file(input)
    outputs.file(output)
    doLast {
        val source = input.readText()
        val marker = "async function orderLoadPrivatePortfolio()"
        require(source.contains(marker)) { "Cannot isolate the pure order-scoring engine" }
        val pure = source.substringBefore(marker)
        require(pure.contains("function orderDrafts("))
        output.get().asFile.apply { parentFile.mkdirs(); writeText(pure) }
    }
}
tasks.named("preBuild") { dependsOn(generateOrderEngine) }
