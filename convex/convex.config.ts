import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import resend from "@convex-dev/resend/convex.config.js";
const app = defineApp();
// The name stays betterAuth to retain existing auth data and sessions.
app.use(betterAuth);
app.use(resend);
export default app;
