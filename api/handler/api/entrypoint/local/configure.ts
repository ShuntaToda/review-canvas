import { config } from "dotenv";
import { applyLocalAwsEnv } from "./local-aws-env";

applyLocalAwsEnv(process.env, config().parsed ?? {});
