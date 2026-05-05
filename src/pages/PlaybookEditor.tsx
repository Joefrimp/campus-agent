import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Textarea } from '@/src/components/ui/textarea';
import { Button } from '@/src/components/ui/button';
import { Save, Info } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

export default function PlaybookEditor() {
  const [playbook, setPlaybook] = useState(
    "Business Rules:\n1. Always call customers 'chief' or 'boss'.\n2. If a customer asks for a discount, offer 5% off if they buy 2 or more items.\n3. Standard delivery within campus is $2, outside campus is $5."
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (supabase) {
        // In a real app, this would update the specific business row,
        // and ideally trigger a Supabase function to update the Vector Store (embeddings).
        await supabase
          .from('businesses')
          .update({ playbook_url: playbook }) // For simplicity, storing text instead of URL here
          .eq('status', 'active');
      } else {
        // Simulate network latency
        await new Promise(r => setTimeout(r, 1000));
      }
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save playbook:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Playbook Editor</h2>
        <p className="text-muted-foreground mt-2">
          Define your conversational rules. The AI agent will consult this Knowledge Base before responding to any WhatsApp message.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Business Rules (Rich Text)</CardTitle>
            <CardDescription>Type instructions as if you are training a new human employee.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <Textarea 
              value={playbook}
              onChange={(e) => setPlaybook(e.target.value)}
              className="flex-1 min-h-[400px] resize-none font-mono text-sm"
              placeholder="Enter your business rules here..."
            />
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6 bg-secondary/10">
            <div className="text-sm text-muted-foreground">
              {lastSaved ? `Last synced: ${lastSaved.toLocaleTimeString()}` : 'Unsaved changes'}
            </div>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Syncing to Vector Store...' : 'Save & Sync Agent'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <Info className="w-5 h-5 shrink-0 text-primary" />
              <p>Everything you write here is converted into Vector Embeddings and stored in Supabase.</p>
            </div>
            <div className="flex gap-3">
              <Info className="w-5 h-5 shrink-0 text-primary" />
              <p>When a customer messages on WhatsApp, n8n queries this Knowledge Base for the most relevant rules.</p>
            </div>
            <div className="flex gap-3">
              <Info className="w-5 h-5 shrink-0 text-primary" />
              <p>Updates are applied instantly. Your agent's next message will follow the new instructions.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
