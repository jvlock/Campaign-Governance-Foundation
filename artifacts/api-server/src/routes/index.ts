import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foundationRouter from "./foundation";
import authRouter from "./auth";
import taxonomyRouter from "./taxonomy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(foundationRouter);
router.use(taxonomyRouter);

export default router;
