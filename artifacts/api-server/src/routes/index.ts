import { Router, type IRouter } from "express";
import agent360Router from "./agent360";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agent360Router);

export default router;
