# Deploying ZTrack on Render (Docker-based)

Since we have configured a `Dockerfile` for the application, deploying to **Render** is straightforward.

---

## 🚀 Step-by-Step Deployment

1. **Log in to Render**:
   - Go to [render.com](https://render.com/) and sign in with your GitHub account.

2. **Create a New Web Service**:
   - Click the **New +** button on your dashboard and select **Web Service**.

3. **Connect Your Repository**:
   - Connect your GitHub account and select your repository: `karthik0497/ZTrack`.

4. **Configure Web Service Settings**:
   - **Name**: `ztrack` (or any name you prefer)
   - **Region**: Select the one closest to you (e.g., Oregon or Frankfurt).
   - **Branch**: `main`
   - **Runtime / Language**: Select **Docker** (Render will automatically detect your `Dockerfile`).
   - **Instance Type**: Select **Free** (or any other tier).

5. **Deploy**:
   - Click **Deploy Web Service** at the bottom of the page.

---

## 🔒 Session Caching & Authentication

* **How it boots**: Once the container is deployed, the app will start up. Since the `session.yaml` file is missing in the production container, the API will return a `401 Unauthorized` status.
* **First Login**: When you open your Render live URL, it will display the secure login screen. Enter your Zepp email and password to log in.
* **Where it's saved**: The session is cached directly in the container's memory/disk under `/app/backend/session.yaml`.

> [!NOTE]
> Since Render's Free tier containers have ephemeral disks (which reset when the app sleeps or restarts), you will need to log in again if the container restarts. If you want permanent token persistence, you can mount a persistent disk in your Render settings under **Disks**, or upgrade your plan.
