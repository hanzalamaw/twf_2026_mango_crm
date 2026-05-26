/** Broadcast Operations real-time updates to the shared "operations" Socket.IO room. */
export function emitOperationsChanged(io, event, payload = {}) {
  if (!io) return;
  io.to("operations").emit("operations:changed", { event, ...payload, at: new Date().toISOString() });
  io.to("operations").emit(event, { ...payload, at: new Date().toISOString() });
}
