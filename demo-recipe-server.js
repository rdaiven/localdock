import { createServer } from "http";

createServer((_req, res) => res.end("Recipe app running")).listen(5175);
