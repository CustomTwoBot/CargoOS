// Live uploads (convex/uploads.ts), shared by /bills/new and the phone page. A file goes to a short-lived
// storage URL, then becomes a document that the server reads in the background; pasted text goes straight in.
// Every call carries the device's person, who must hold "uploader". Only call this under a Convex provider.
import { useMutation } from "convex/react";
import { useState } from "react";
import type { Person } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UploadDocType, UploadState } from "./kinds";

export function useLiveUploads(person: Person) {
  const createCase = useMutation(api.uploads.createCase);
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const addDocument = useMutation(api.uploads.addDocument);
  const addPastedText = useMutation(api.uploads.addPastedText);
  const personId = person.id;

  return {
    createCase: (title: string) => createCase({ personId, title }),
    async uploadFile(caseId: Id<"cases">, file: File, docType: UploadDocType): Promise<Id<"documents">> {
      const url = await generateUploadUrl({ personId });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error(`the upload didn't finish (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return await addDocument({ caseId, personId, storageId, fileName: file.name, docType });
    },
    pasteText: (caseId: Id<"cases">, text: string, docType: UploadDocType, title: string) =>
      addPastedText({ caseId, personId, text, docType, title }),
  };
}

/** One upload this device started: uploading until the server hands back its document id. */
export type LocalUpload = {
  key: string; name: string; docType: UploadDocType; file?: File;
  state: Extract<UploadState, "uploading" | "failed">; error?: string;
  docId?: Id<"documents">;
};

let seq = 0;
export const uploadKey = () => `up_${++seq}`;

/** The device's own uploads, updated by key. */
export function useLocalUploads() {
  const [items, setItems] = useState<LocalUpload[]>([]);
  return {
    items,
    add: (rows: LocalUpload[]) => setItems((all) => [...all, ...rows]),
    patch: (key: string, p: Partial<LocalUpload>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i))),
    /** Drops an upload that never reached the server (a failed upload), so it leaves the list. */
    remove: (key: string) => setItems((all) => all.filter((i) => i.key !== key)),
    clear: () => setItems([]),
  };
}
