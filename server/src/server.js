const http = require("http");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { Board, Column, Task, User } = require("./models");
const { COOKIE_NAME, jwtSecret, passport } = require("./auth");

const DEFAULT_COLUMNS = [
  { name: "To do", color: "#9c8dfa", order: 0 },
  { name: "In progress", color: "#efb25c", order: 1 },
  { name: "Done", color: "#65ab82", order: 2 },
];

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

function setAuthCookie(response, user) {
  const token = jwt.sign({ sub: user._id.toString() }, jwtSecret(), { expiresIn: "7d" });
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
}

function validText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function broadcast(request, boardId, type, payload = {}) {
  request.app.get("io")?.to(boardId.toString()).emit("board:update", { type, boardId: boardId.toString(), ...payload });
}

async function inTransaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function findBoardForUser(boardId, userId) {
  return Board.findOne({
    _id: boardId,
    $or: [{ owner: userId }, { members: userId }],
  });
}

async function serializeBoard(board) {
  const columns = await Column.find({ board: board._id }).sort({ order: 1, createdAt: 1 }).lean();
  const tasks = await Task.find({ board: board._id }).sort({ order: 1, createdAt: 1 }).lean();
  return {
    id: board._id.toString(),
    name: board.name,
    title: board.name,
    description: board.description,
    owner: board.owner.toString(),
    inviteToken: board.inviteToken,
    createdAt: board.createdAt,
    columns: columns.map((column) => ({
      id: column._id.toString(),
      name: column.name,
      color: column.color,
      order: column.order,
      tasks: tasks
        .filter((task) => task.column.toString() === column._id.toString())
        .map((task) => ({
          id: task._id.toString(),
          title: task.title,
          description: task.description,
          labels: task.labels,
          priority: task.priority,
          assignee: task.assignee,
          dueDate: task.dueDate,
          order: task.order,
          columnId: task.column.toString(),
          comments: 0,
          updatedAt: task.updatedAt,
        })),
    })),
  };
}

function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("This origin is not allowed by the CORS policy."));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get("/", (request, response) => {
    response.json({ message: "TaskFlow API is running.", status: "success", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
  });

  app.post("/api/auth/register", asyncRoute(async (request, response) => {
    const { name, email, password } = request.body || {};
    if (!validText(name, 80) || !validText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: "Enter a name, a valid email, and a password between 8 and 128 characters." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return response.status(409).json({ message: "An account with that email already exists." });
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12) });
    setAuthCookie(response, user);
    return response.status(201).json({ user: publicUser(user) });
  }));

  app.post("/api/auth/login", (request, response, next) => {
    passport.authenticate("local", { session: false }, (error, user, info) => {
      if (error) return next(error);
      if (!user) return response.status(401).json({ message: info?.message || "Email or password is incorrect." });
      setAuthCookie(response, user);
      return response.json({ user: publicUser(user) });
    })(request, response, next);
  });

  const requireUser = (request, response, next) => {
    passport.authenticate("jwt", { session: false }, (error, user) => {
      if (error) return next(error);
      if (!user) return response.status(401).json({ message: "Sign in to access this resource." });
      request.user = user;
      return next();
    })(request, response, next);
  };

  app.get("/api/auth/me", requireUser, (request, response) => response.json({ user: publicUser(request.user) }));
  app.post("/api/auth/logout", (request, response) => {
    clearAuthCookie(response);
    response.json({ message: "Signed out." });
  });

  app.get("/api/boards", requireUser, asyncRoute(async (request, response) => {
    const boards = await Board.find({ $or: [{ owner: request.user._id }, { members: request.user._id }] }).sort({ updatedAt: -1 });
    response.json({ boards: await Promise.all(boards.map(serializeBoard)) });
  }));

  app.post("/api/boards", requireUser, asyncRoute(async (request, response) => {
    const { name, description = "" } = request.body || {};
    if (!validText(name, 100) || typeof description !== "string" || description.length > 500) {
      return response.status(400).json({ message: "A board name of at most 100 characters is required." });
    }
    const board = await inTransaction(async (session) => {
      const [createdBoard] = await Board.create([{
        name: name.trim(),
        description: description.trim(),
        owner: request.user._id,
        members: [request.user._id],
        inviteToken: crypto.randomBytes(24).toString("hex"),
      }], { session });
      await Column.insertMany(DEFAULT_COLUMNS.map((column) => ({ ...column, board: createdBoard._id })), { session });
      return createdBoard;
    });
    response.status(201).json({ board: await serializeBoard(board) });
  }));

  app.post("/api/boards/join/:inviteToken", requireUser, asyncRoute(async (request, response) => {
    const board = await Board.findOneAndUpdate(
      { inviteToken: request.params.inviteToken },
      { $addToSet: { members: request.user._id } },
      { new: true }
    );
    if (!board) return response.status(404).json({ message: "This invitation link is invalid or has expired." });
    broadcast(request, board._id, "member:joined", { user: publicUser(request.user) });
    response.json({ board: await serializeBoard(board) });
  }));

  app.get("/api/boards/:boardId", requireUser, asyncRoute(async (request, response) => {
    const board = await findBoardForUser(request.params.boardId, request.user._id);
    if (!board) return response.status(404).json({ message: "Board not found." });
    response.json({ board: await serializeBoard(board) });
  }));

  app.patch("/api/boards/:boardId", requireUser, asyncRoute(async (request, response) => {
    const updates = {};
    if (request.body?.name !== undefined) {
      if (!validText(request.body.name, 100)) return response.status(400).json({ message: "Board name must be between 1 and 100 characters." });
      updates.name = request.body.name.trim();
    }
    if (request.body?.description !== undefined) {
      if (typeof request.body.description !== "string" || request.body.description.length > 500) return response.status(400).json({ message: "Board description must be at most 500 characters." });
      updates.description = request.body.description.trim();
    }
    const board = await Board.findOneAndUpdate(
      { _id: request.params.boardId, $or: [{ owner: request.user._id }, { members: request.user._id }] },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!board) return response.status(404).json({ message: "Board not found." });
    broadcast(request, board._id, "board:updated");
    response.json({ board: await serializeBoard(board) });
  }));

  app.delete("/api/boards/:boardId", requireUser, asyncRoute(async (request, response) => {
    const board = await findBoardForUser(request.params.boardId, request.user._id);
    if (!board) return response.status(404).json({ message: "Board not found." });
    if (board.owner.toString() !== request.user._id.toString()) return response.status(403).json({ message: "Only the board owner can delete this board." });
    await inTransaction(async (session) => {
      await Task.deleteMany({ board: board._id }, { session });
      await Column.deleteMany({ board: board._id }, { session });
      await Board.deleteOne({ _id: board._id }, { session });
    });
    request.app.get("io")?.to(board._id.toString()).emit("board:update", { type: "board:deleted", boardId: board._id.toString() });
    response.json({ message: "Board deleted." });
  }));

  app.post("/api/boards/:boardId/columns", requireUser, asyncRoute(async (request, response) => {
    if (!validText(request.body?.name, 60)) return response.status(400).json({ message: "Column name must be between 1 and 60 characters." });
    const board = await findBoardForUser(request.params.boardId, request.user._id);
    if (!board) return response.status(404).json({ message: "Board not found." });
    const order = await Column.countDocuments({ board: board._id });
    const column = await Column.create({ board: board._id, name: request.body.name.trim(), order });
    broadcast(request, board._id, "column:created", { columnId: column._id.toString() });
    response.status(201).json({ column: { id: column._id.toString(), name: column.name, color: column.color, order: column.order, tasks: [] } });
  }));

  app.patch("/api/columns/:columnId", requireUser, asyncRoute(async (request, response) => {
    if (!validText(request.body?.name, 60)) return response.status(400).json({ message: "Column name must be between 1 and 60 characters." });
    const column = await Column.findById(request.params.columnId);
    if (!column || !(await findBoardForUser(column.board, request.user._id))) return response.status(404).json({ message: "Column not found." });
    column.name = request.body.name.trim();
    await column.save();
    broadcast(request, column.board, "column:updated", { columnId: column._id.toString() });
    response.json({ column: { id: column._id.toString(), name: column.name, color: column.color, order: column.order } });
  }));

  app.delete("/api/columns/:columnId", requireUser, asyncRoute(async (request, response) => {
    const column = await Column.findById(request.params.columnId);
    if (!column || !(await findBoardForUser(column.board, request.user._id))) return response.status(404).json({ message: "Column not found." });
    const boardId = column.board;
    await inTransaction(async (session) => {
      await Task.deleteMany({ column: column._id }, { session });
      await Column.deleteOne({ _id: column._id }, { session });
    });
    broadcast(request, boardId, "column:deleted", { columnId: column._id.toString() });
    response.json({ message: "Column and its tasks deleted." });
  }));

  app.post("/api/tasks", requireUser, asyncRoute(async (request, response) => {
    const { boardId, columnId, title, description = "", labels = [], priority = "Medium", assignee = "", dueDate = null } = request.body || {};
    if (!validText(title, 120)) return response.status(400).json({ message: "Task title must be between 1 and 120 characters." });
    if (typeof description !== "string" || description.length > 2000) return response.status(400).json({ message: "Task description must be at most 2,000 characters." });
    if (typeof assignee !== "string" || assignee.length > 80) return response.status(400).json({ message: "Assignee must be at most 80 characters." });
    if (!Array.isArray(labels) || labels.length > 12 || labels.some((label) => typeof label !== "string" || label.length > 32)) return response.status(400).json({ message: "Task labels must be a list of at most 12 short names." });
    if (!["Low", "Medium", "High"].includes(priority)) return response.status(400).json({ message: "Priority must be Low, Medium, or High." });
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) return response.status(400).json({ message: "Due date is invalid." });
    const board = await findBoardForUser(boardId, request.user._id);
    const column = await Column.findOne({ _id: columnId, board: boardId });
    if (!board || !column) return response.status(404).json({ message: "Board or column not found." });
    const order = await Task.countDocuments({ column: column._id });
    const task = await Task.create({
      board: board._id,
      column: column._id,
      title: title.trim(),
      description,
      labels: labels.map((label) => label.trim()),
      priority,
      assignee,
      dueDate: parsedDueDate,
      order,
      createdBy: request.user._id,
    });
    broadcast(request, board._id, "task:created", { taskId: task._id.toString() });
    response.status(201).json({ task: { ...task.toJSON(), id: task._id.toString(), columnId: column._id.toString(), comments: 0 } });
  }));

  app.patch("/api/tasks/:taskId", requireUser, asyncRoute(async (request, response) => {
    const task = await Task.findById(request.params.taskId);
    if (!task || !(await findBoardForUser(task.board, request.user._id))) return response.status(404).json({ message: "Task not found." });
    const body = request.body || {};
    const updates = {};
    if (body.title !== undefined) {
      if (!validText(body.title, 120)) return response.status(400).json({ message: "Task title must be between 1 and 120 characters." });
      updates.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 2000) return response.status(400).json({ message: "Task description must be at most 2,000 characters." });
      updates.description = body.description.trim();
    }
    if (body.labels !== undefined) {
      if (!Array.isArray(body.labels) || body.labels.length > 12 || body.labels.some((label) => typeof label !== "string" || label.length > 32)) return response.status(400).json({ message: "Task labels must be a list of at most 12 short names." });
      updates.labels = body.labels.map((label) => label.trim());
    }
    if (body.priority !== undefined) {
      if (!["Low", "Medium", "High"].includes(body.priority)) return response.status(400).json({ message: "Priority must be Low, Medium, or High." });
      updates.priority = body.priority;
    }
    if (body.assignee !== undefined) {
      if (typeof body.assignee !== "string" || body.assignee.length > 80) return response.status(400).json({ message: "Assignee must be at most 80 characters." });
      updates.assignee = body.assignee.trim();
    }
    if (body.dueDate !== undefined) {
      const date = body.dueDate ? new Date(body.dueDate) : null;
      if (date && Number.isNaN(date.getTime())) return response.status(400).json({ message: "Due date is invalid." });
      updates.dueDate = date;
    }

    const destinationId = body.columnId || task.column.toString();
    const destination = await Column.findOne({ _id: destinationId, board: task.board });
    if (!destination) return response.status(404).json({ message: "Destination column not found." });
    const requestedOrder = Number.isInteger(body.order) && body.order >= 0 ? body.order : undefined;

    await inTransaction(async (session) => {
      const movingTask = await Task.findById(task._id).session(session);
      const sourceTasks = await Task.find({ board: task.board, column: movingTask.column }).sort({ order: 1, createdAt: 1 }).session(session);
      const sourceWithoutTask = sourceTasks.filter((item) => item._id.toString() !== movingTask._id.toString());
      const sameColumn = movingTask.column.toString() === destinationId;
      let destinationTasks;
      if (sameColumn) {
        destinationTasks = sourceWithoutTask;
      } else {
        destinationTasks = await Task.find({ board: task.board, column: destinationId }).sort({ order: 1, createdAt: 1 }).session(session);
      }
      const newOrder = Math.min(requestedOrder ?? destinationTasks.length, destinationTasks.length);
      destinationTasks.splice(newOrder, 0, movingTask);
      const writes = [];
      if (!sameColumn) {
        sourceWithoutTask.forEach((item, index) => writes.push({
          updateOne: { filter: { _id: item._id }, update: { $set: { order: index } } },
        }));
      }
      destinationTasks.forEach((item, index) => writes.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              ...(item._id.toString() === movingTask._id.toString() ? updates : {}),
              column: destination._id,
              order: index,
            },
          },
        },
      }));
      if (writes.length) await Task.bulkWrite(writes, { session });
    });
    const updatedTask = await Task.findById(task._id);
    broadcast(request, task.board, "task:updated", { taskId: task._id.toString() });
    response.json({
      task: { ...updatedTask.toJSON(), id: updatedTask._id.toString(), columnId: updatedTask.column.toString(), comments: 0 },
    });
  }));

  app.delete("/api/tasks/:taskId", requireUser, asyncRoute(async (request, response) => {
    const task = await Task.findById(request.params.taskId);
    if (!task || !(await findBoardForUser(task.board, request.user._id))) return response.status(404).json({ message: "Task not found." });
    await Task.deleteOne({ _id: task._id });
    broadcast(request, task.board, "task:deleted", { taskId: task._id.toString() });
    response.json({ message: "Task deleted." });
  }));

  app.use((request, response) => response.status(404).json({ message: "Route not found." }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
      return response.status(400).json({ message: error.message });
    }
    if (error.code === 11000) return response.status(409).json({ message: "That value is already in use." });
    if (error.type === "entity.parse.failed") return response.status(400).json({ message: "Request body must contain valid JSON." });
    console.error("TaskFlow API error:", error.message);
    return response.status(500).json({ message: "The server could not complete your request." });
  });
  return app;
}

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((origin) => origin.trim()),
    credentials: true,
  },
});
app.set("io", io);

io.use((socket, next) => {
  const cookies = socket.handshake.headers.cookie || "";
  const tokenCookie = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!tokenCookie) return next(new Error("Sign in to join a board."));
  let token;
  try {
    token = decodeURIComponent(tokenCookie.slice(COOKIE_NAME.length + 1));
    socket.data.userId = jwt.verify(token, jwtSecret()).sub;
  } catch {
    return next(new Error("Your session has expired. Sign in again."));
  }
  return next();
});

io.on("connection", (socket) => {
  socket.on("board:join", async (boardId, acknowledge) => {
    try {
      if (typeof boardId !== "string" || !mongoose.isValidObjectId(boardId)) {
        if (typeof acknowledge === "function") acknowledge({ error: "Board not found." });
        return;
      }
      const board = await findBoardForUser(boardId, socket.data.userId);
      if (!board) {
        if (typeof acknowledge === "function") acknowledge({ error: "You do not have access to that board." });
        return;
      }
      const room = board._id.toString();
      for (const joinedRoom of socket.rooms) {
        if (joinedRoom !== socket.id) socket.leave(joinedRoom);
      }
      await socket.join(room);
      io.to(room).emit("board:presence", { boardId: room, count: io.sockets.adapter.rooms.get(room)?.size || 0 });
      if (typeof acknowledge === "function") acknowledge({ joined: true });
    } catch (error) {
      console.error("TaskFlow socket error:", error.message);
      if (typeof acknowledge === "function") acknowledge({ error: "Could not join the board." });
    }
  });
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.to(room).emit("board:presence", { boardId: room, count: Math.max(0, (io.sockets.adapter.rooms.get(room)?.size || 1) - 1) });
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be configured before starting in production.");
  }
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected.");
  } else {
    console.warn("MONGODB_URI is not configured. Set it before using persistent API routes.");
  }
  const port = Number(process.env.PORT) || 5000;
  server.listen(port, () => console.log(`TaskFlow API listening on port ${port}.`));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Could not start TaskFlow:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, server, io, createApp, startServer, inTransaction };
