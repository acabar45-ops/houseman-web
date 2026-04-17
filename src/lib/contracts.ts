import { supabase } from './supabase';

/**
 * contracts 테이블 upsert — onConflict: 'contract_id'
 * 원본: src/lib/supabaseData.js
 */
export async function upsertContract(contract: any): Promise<{ error: any }> {
  const { error } = await supabase
    .from('contracts')
    .upsert({ ...contract, updated_at: new Date().toISOString() }, { onConflict: 'contract_id' });
  if (error) console.error('[contracts] 저장 실패:', error);
  return { error };
}

export async function deleteContract(contractId: string | number): Promise<{ error: any }> {
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('contract_id', contractId);
  if (error) console.error('[contracts] 삭제 실패:', error);
  return { error };
}
