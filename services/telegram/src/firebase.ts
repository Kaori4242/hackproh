import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "./config.js";

const app =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
