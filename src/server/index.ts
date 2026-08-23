import { app } from "./app";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  console.info(`Regulatory API listening on http://localhost:${port}`);
});
