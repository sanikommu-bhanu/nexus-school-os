"use client";

import { MessagesListScreen } from "@/components/shell/MessagesListScreen";

export default function TeacherMessagesPage() {
  return <MessagesListScreen role="teacher" newHref="/teacher/messages/new" />;
}
