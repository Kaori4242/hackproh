import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { config } from "./config.js";

const app =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
    storageBucket: config.firebaseStorageBucket || undefined
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
export const adminFieldValue = FieldValue;
