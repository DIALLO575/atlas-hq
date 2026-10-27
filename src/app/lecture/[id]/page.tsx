import { BookLibrary } from "@/components/books/book-library";
import "../lecture.css";
import "../reader-status.css";
import "../lecture-refined.css";
export const dynamic = "force-dynamic";
export default async function BookReaderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BookLibrary readerId={id} />; }
