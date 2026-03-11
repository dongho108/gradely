"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        if (window.opener) {
          window.close();
        } else {
          window.location.href = "/";
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-gray-500">로그인 처리 중...</p>
    </div>
  );
}
