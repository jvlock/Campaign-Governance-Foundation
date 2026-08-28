import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foundationRouter from "./foundation";
import authRouter from "./auth";
import taxonomyRouter from "./taxonomy";
import campaignsRouter from "./campaigns";
import financeRouter from "./finance";
import channelActivitiesRouter from "./channel-activities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(foundationRouter);
router.use(taxonomyRouter);
router.use(campaignsRouter);
router.use(financeRouter);
router.use(channelActivitiesRouter);

export default router;
