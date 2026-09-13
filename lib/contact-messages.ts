import {
  addDoc,
  collection,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: "new" | "done";
  read: boolean;
  createdAt: Timestamp | null;
};

export type ContactMessageInput = {
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
};

export async function submitContactMessage(input: ContactMessageInput) {
  const db = getFirebaseDb();
  await addDoc(collection(db, "contactMessages"), {
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    topic: input.topic.trim(),
    message: input.message.trim(),
    status: "new",
    read: false,
    createdAt: serverTimestamp(),
  });
}
