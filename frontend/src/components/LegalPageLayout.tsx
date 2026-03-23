import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import Header from "./Header";

type Props = {
  title: string;
  updatedAt: string;
  children: ReactNode;
};

export function LegalPageLayout({ title, updatedAt, children }: Props) {
  return (
    <>
      <Header />
      <main className="bg-gray-50 min-h-screen pb-16">
        <div className="container mx-auto px-4 py-8 sm:py-10 max-w-3xl">
          <Link className="text-sm font-semibold text-primary hover:text-forest-green mb-6 inline-block" to="/">
            ← На главную
          </Link>
          <article className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-10 shadow-sm">
            <h1 className="text-2xl sm:text-3xl font-bold text-forest-green mb-2">{title}</h1>
            <p className="text-xs text-gray-500 mb-8">Республика Беларусь · редакция от {updatedAt}</p>
            <div className="text-gray-700 text-sm leading-relaxed space-y-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-forest-green [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:first:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1">
              {children}
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
