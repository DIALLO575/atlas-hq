import type { Metadata } from "next";
import { BookLibrary } from "@/components/books/book-library";
import "./lecture.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bibliothèque · ATLAS HQ", description: "Votre espace de lecture ATLAS." };
export default function LecturePage() { return <BookLibrary />; }
