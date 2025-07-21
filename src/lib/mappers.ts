/**
 * @fileoverview This file contains utility functions for mapping Firestore documents.
 */

import { DocumentData } from "firebase/firestore";

/**
 * Maps a Firestore document to a generic interface type.
 * It takes a document snapshot and returns an object of type T,
 * including the document ID and its data.
 *
 * @param {DocumentData} doc The Firestore document snapshot.
 * @returns {T} The mapped object with the document ID.
 */
export function mapDocTo<T>(doc: DocumentData): T {
    const data = doc.data();
    return { id: doc.id, ...data } as T;
}
