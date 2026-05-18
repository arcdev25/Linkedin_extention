// Shim so bcryptjs UMD works in service worker context
// In SW, 'this' at top level is undefined — bcryptjs needs globalThis
var self = globalThis;
