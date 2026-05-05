import * as React from 'react';
import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { UploadCloud, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

interface FileWithPreview extends File {
  preview: string;
}

export default function InventoryUpload() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => Object.assign(file, {
        preview: URL.createObjectURL(file as unknown as Blob)
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      // In a real app, upload files to Supabase Storage first, then send URLs to n8n
      // Here we just mock the process
      
      const webhookUrl = import.meta.env.VITE_N8N_VISION_WEBHOOK;
      if (webhookUrl) {
        // Send to n8n Vision-to-Inventory pipeline
        // (Mock payload, normally you'd send base64 or public URLs)
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageCount: files.length,
            message: 'Extract inventory data from these images'
          })
        });
      }

      // Cleanup
      files.forEach(f => URL.revokeObjectURL(f.preview));
      setFiles([]);
      alert('Images sent to Vision-to-Inventory pipeline successfully.');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Check console for details.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Gallery Upload</h2>
        <p className="text-muted-foreground mt-2">
          Upload product photos (e.g., clothing, merchandise). Our AI will automatically extract details, categorize them, and add to your inventory.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vision-to-Inventory Pipeline</CardTitle>
          <CardDescription>Drag and drop images or click to browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-secondary/20 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Drop photos here</h3>
            <p className="text-sm text-muted-foreground mt-1">Supports JPG, PNG up to 10MB each</p>
            <input 
              type="file" 
              className="hidden" 
              multiple 
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-8">
              <h4 className="font-medium mb-4">Selected Files ({files.length})</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {files.map((file, i) => (
                  <div key={i} className="relative group rounded-md overflow-hidden border">
                    <img 
                      src={file.preview} 
                      alt="preview" 
                      className="w-full h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="bg-destructive text-destructive-foreground p-1.5 rounded-full"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end border-t pt-6 bg-secondary/10">
          <Button 
            onClick={handleUpload} 
            disabled={files.length === 0 || isUploading}
          >
            {isUploading ? 'Processing...' : 'Run Extraction Pipeline'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
