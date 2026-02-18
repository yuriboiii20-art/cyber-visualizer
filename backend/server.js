const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const locations = [
  { country: "Russia", lat: 55.7558, lng: 37.6173 },
  { country: "USA", lat: 38.9072, lng: -77.0369 },
  { country: "China", lat: 39.9042, lng: 116.4074 },
  { country: "India", lat: 28.6139, lng: 77.2090 },
  { country: "Germany", lat: 52.5200, lng: 13.4050 },
  { country: "Brazil", lat: -15.7939, lng: -47.8828 },
];

const attackTypes = [
  "BRUTE_FORCE",
  "DDoS",
  "SQL_INJECTION",
  "PORT_SCAN",
  "RANSOMWARE",
  "PHISHING",
];

const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomIp() {
  return Array(4)
    .fill(0)
    .map(() => Math.floor(Math.random() * 256))
    .join(".");
}

function generateAttackEvent() {
  const source = randomItem(locations);
  const target = randomItem(locations);

  return {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    sourceIp: randomIp(),
    targetIp: randomIp(),
    attackType: randomItem(attackTypes),
    severity: randomItem(severities),
  };
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  const intervalId = setInterval(() => {
    socket.emit("attackEvent", generateAttackEvent());
  }, 4000);

  socket.on("disconnect", () => {
    clearInterval(intervalId);
  });
});

app.get("/", (req, res) => {
  res.send("Cyber Threat Visualizer backend is running");
});

server.listen(4000, () => {
  console.log("Server listening on port 4000");
});
