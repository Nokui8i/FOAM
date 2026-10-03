import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes, uploadString } from "firebase/storage";

const projectId = "demo-foam-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
    storage: {
      rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff/driver-1"), { status: "approved", role: "driver" });
    await setDoc(doc(db, "staff/driver-2"), { status: "approved", role: "driver" });
    await setDoc(doc(db, "orders/order-1"), { assignedDriverUid: "driver-1" });
    await setDoc(doc(db, "orders/order-2"), { assignedDriverUid: "driver-2" });
  });
});

after(async () => {
  await env.cleanup();
});

test("assigned drivers can upload images for their order only", async () => {
  const driver = env.authenticatedContext("driver-1").storage();
  const own = ref(driver, "order-photos/order-1/weight.jpg");
  await assertSucceeds(
    uploadString(own, "image-bytes", "raw", { contentType: "image/jpeg" })
  );
  await assertSucceeds(getBytes(own));
  const other = ref(driver, "order-photos/order-2/weight.jpg");
  await assertFails(
    uploadString(other, "image-bytes", "raw", { contentType: "image/jpeg" })
  );
  await assertFails(getBytes(other));
  await assertFails(
    uploadString(own, "not-an-image", "raw", { contentType: "text/plain" })
  );
  await assertFails(
    uploadBytes(ref(driver, "order-photos/order-1/huge.jpg"), new Uint8Array(8 * 1024 * 1024), {
      contentType: "image/jpeg",
    })
  );
});

test("admins can read order photos and anonymous clients cannot", async () => {
  const admin = env.authenticatedContext("owner", {
    email: "paylocksmith@gmail.com",
    email_verified: true,
  }).storage();
  const path = ref(admin, "order-photos/order-2/return.jpg");
  await assertSucceeds(
    uploadString(path, "image-bytes", "raw", { contentType: "image/jpeg" })
  );
  const anonymous = env.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(anonymous, "order-photos/order-2/return.jpg")));
  await assertFails(
    uploadString(ref(anonymous, "order-photos/order-2/return.jpg"), "x", "raw", {
      contentType: "image/jpeg",
    })
  );
});
