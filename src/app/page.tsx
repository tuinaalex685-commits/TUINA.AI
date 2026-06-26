import { redirect } from "next/navigation";

export default function Home() {
  // Redirection directe vers le dashboard de l'application
  redirect("/app/dashboard");
}
