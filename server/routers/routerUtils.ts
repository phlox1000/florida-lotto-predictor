import { z } from "zod";
import { GAME_TYPES } from "@shared/lottery";

export const gameTypeSchema = z.enum(GAME_TYPES);
