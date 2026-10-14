const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

const boardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    inviteToken: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const columnSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, default: "#9c8dfa" },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    column: { type: mongoose.Schema.Types.ObjectId, ref: "Column", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    labels: { type: [String], default: [] },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    assignee: { type: String, trim: true, default: "" },
    dueDate: { type: Date, default: null },
    order: { type: Number, required: true, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
taskSchema.index({ board: 1, column: 1, order: 1 });

module.exports = {
  User: mongoose.models.User || mongoose.model("User", userSchema),
  Board: mongoose.models.Board || mongoose.model("Board", boardSchema),
  Column: mongoose.models.Column || mongoose.model("Column", columnSchema),
  Task: mongoose.models.Task || mongoose.model("Task", taskSchema),
};
