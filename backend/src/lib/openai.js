import OpenAI from 'openai';
import { config } from '../config/config.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });
