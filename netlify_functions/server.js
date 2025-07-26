// netlify_functions/server.js
import express from 'express';
import serverless from 'serverless-http';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// 导入主应用逻辑
import { app } from '../main.js';

// 将Express应用包装为serverless函数
export const handler = serverless(app);