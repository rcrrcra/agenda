import { createApp } from "./bootstrap";

createApp().then((app) => app.listen(Number(process.env.PORT ?? 8000), "0.0.0.0"));
