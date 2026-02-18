# Cyber Visualizer

Real-time 3D cyber threat visualization platform built with React, Three.js, and Node.js. visualize global cyber attacks and network traffic on an interactive globe.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🚀 Features

-   **Interactive 3D Globe**: Visualizes threats geographically using `react-globe.gl` and `three.js`.
-   **Real-time Data**: WebSocket integration (`socket.io`) for live threat updates.
-   **Modern Frontend**: Built with React 19.
-   **Scalable Backend**: Node.js & Express server handling real-time connections.
-   **Supabase Integration**: Ready for database connections and authentication.

## 🛠️ Tech Stack

### Frontend
-   **React** (v19)
-   **Three.js / React Globe.gl** (3D Visualization)
-   **Socket.IO Client** (Real-time communication)
-   **Supabase Client** (Backend as a Service)

### Backend
-   **Node.js & Express**
-   **Socket.IO** (WebSocket Server)
-   **CORS** (Cross-Origin Resource Sharing)

## 📦 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yuriboiii20-art/cyber-visualizer.git
    cd cyber-visualizer
    ```

2.  **Install Backend Dependencies**
    ```bash
    cd backend
    npm install
    ```

3.  **Install Frontend Dependencies**
    ```bash
    cd ../frontend
    npm install
    ```

## 🏃‍♂️ Usage

### Start the Backend Server
From the root directory:
```bash
cd backend
node server.js
```
*The backend typically runs on port 5000 or similar (check `server.js`).*

### Start the Frontend Application
Open a new terminal, navigate to the frontend folder, and start the React app:
```bash
cd frontend
npm start
```
*The application will open in your browser at `http://localhost:3000`.*

## 📂 Project Structure

```
cyber-visualizer/
├── backend/            # Express server & Socket.IO logic
│   ├── server.js       # Entry point for backend
│   └── package.json
├── frontend/           # React application
│   ├── public/
│   ├── src/            # Components, hooks, and logic
│   └── package.json
└── README.md           # Project documentation
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.