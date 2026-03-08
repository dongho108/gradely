"use client";

import { useState, useCallback, useRef } from "react";
import { UploadCloud, FileType, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

export function UploadZone({ 
  onFileSelect, 
  accept = "application/pdf, image/jpeg, image/png", 
  maxSizeMB = 10,
  className 
}: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter") {
      dragCounterRef.current++;
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragActive(false);
      }
    }
  }, []);

  const validateAndUpload = useCallback((file: File) => {
    setError(null);
    
    const allowedTypes = accept.split(",").map(t => t.trim());
    if (!allowedTypes.includes(file.type)) {
      setError("PDF와 이미지 파일(JPG, PNG)만 허용됩니다.");
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`파일 크기는 ${maxSizeMB}MB 이하여야 합니다.`);
      return;
    }

    onFileSelect(file);
  }, [accept, maxSizeMB, onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  }, [validateAndUpload]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  }, [validateAndUpload]);

  return (
    <div className={cn("w-full max-w-xl mx-auto", className)}>
      <div
        className={cn(
          "relative group flex flex-col items-center justify-center w-full min-h-[300px] rounded-2xl border-2 border-dashed transition-all duration-300 ease-out cursor-pointer overflow-hidden",
          isDragActive
            ? "border-primary bg-primary/5 scale-[1.02] shadow-xl shadow-primary/10"
            : "border-gray-200 bg-white hover:border-primary/50 hover:bg-gray-50",
          error && "border-red-300 bg-red-50 hover:bg-red-50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleChange}
        />

        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 z-10">
          <div className={cn(
            "p-5 rounded-full transition-transform duration-500",
            isDragActive ? "bg-white shadow-lg scale-110" : "bg-gray-50 group-hover:bg-white group-hover:shadow-md",
            error && "bg-red-100 text-red-500"
          )}>
            {error ? (
              <AlertCircle className="w-10 h-10" />
            ) : (
              <UploadCloud className={cn("w-10 h-10 transition-colors", isDragActive ? "text-primary" : "text-gray-400 group-hover:text-primary/80")} />
            )}
          </div>

          <div className="space-y-1">
            <h3 className={cn("text-xl font-bold transition-colors", isDragActive ? "text-primary" : "text-gray-700")}>
              {error ? "업로드 실패" : isDragActive ? "여기에 파일을 놓으세요" : "클릭하거나 파일을 드래그하세요"}
            </h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              {error || `정답지 업로드 (PDF 또는 이미지, 최대 ${maxSizeMB}MB)`}
            </p>
          </div>
          
          {!error && (
             <div className="flex gap-3 pt-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-xs font-medium text-gray-500 group-hover:bg-gray-200 transition-colors">
                    <FileType className="w-3.5 h-3.5" /> PDF, JPG, PNG
                </span>
             </div>
          )}
        </div>
        
        {/* Decorative background grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat" />
      </div>
    </div>
  );
}
