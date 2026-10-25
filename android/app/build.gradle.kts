plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "mx.investmentchecker.tablet"
    compileSdk = 35
    defaultConfig {
        applicationId = "mx.investmentchecker.tablet"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-overlay"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
