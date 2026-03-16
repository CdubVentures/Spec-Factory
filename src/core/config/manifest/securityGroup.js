export const securityGroup = Object.freeze({
  id: "security",
  title: "Security and Auth",
  notes: "Authentication and trust-boundary controls.",
  entries: Object.freeze([
    { key: "JWT_EXPIRES_IN", defaultValue: "7d", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "JWT_SECRET", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
