import admin from "firebase-admin";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = join(__dirname, "egygo-295e1-firebase-adminsdk-fbsvc-7193a7f9f5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
