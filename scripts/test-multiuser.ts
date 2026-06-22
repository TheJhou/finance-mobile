/**
 * Script para testar o sistema multi-usuário e backup
 * Execute com: npx ts-node scripts/test-multiuser.ts
 */

import { getDb, generateId, resetDbCache } from '../lib/db';
import { BackupSystem } from '../lib/backup';
import { BackupScheduler } from '../lib/backup-scheduler';
import { createTransaction, listTransactions } from '../lib/repositories/transactions';
import { createCategory, listCategories } from '../lib/repositories/categories';

interface TestUser {
  id: string;
  name: string;
  email: string;
  deviceId: string;
}

class MultiUserTester {
  private users: TestUser[] = [];
  private testResults: any[] = [];

  constructor() {
    this.setupTestUsers();
  }

  private setupTestUsers(): void {
    // Criar 20 usuários de teste
    for (let i = 1; i <= 20; i++) {
      this.users.push({
        id: `user_test_${i}`,
        name: `Usuário Teste ${i}`,
        email: `user${i}@test.com`,
        deviceId: `device_${generateId().slice(0, 8)}`
      });
    }
  }

  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, data };
    this.testResults.push(logEntry);
    console.log(`[${timestamp}] ${message}`, data || '');
  }

  async runAllTests(): Promise<void> {
    this.log('🚀 Iniciando testes multi-usuário e backup');
    
    try {
      await this.testUserIsolation();
      await this.testConcurrentOperations();
      await this.testBackupSystem();
      await this.testSchedulerSystem();
      await this.testDataIntegrity();
      await this.testPerformance();
      
      this.generateReport();
    } catch (error) {
      this.log('❌ Falha nos testes', error);
      throw error;
    }
  }

  private async testUserIsolation(): Promise<void> {
    this.log('📋 Testando isolamento de usuários');
    
    for (const user of this.users.slice(0, 5)) { // Testar com 5 usuários primeiro
      this.log(`  👤 Testando usuário: ${user.name}`);
      
      // Resetar cache para simular dispositivo diferente
      resetDbCache();
      
      const db = await getDb();
      
      // Criar categorias para este usuário
      const category1 = await createCategory({
        name: `Categoria ${user.name} 1`,
        color: '#ff0000',
        icon: 'tag',
        userId: user.id
      });
      
      const category2 = await createCategory({
        name: `Categoria ${user.name} 2`,
        color: '#00ff00',
        icon: 'star',
        userId: user.id
      });
      
      // Criar transações para este usuário
      await createTransaction({
        description: `Transação ${user.name} 1`,
        amount: 100 * (parseInt(user.id.split('_')[2]) || 1),
        type: 'EXPENSE',
        categoryId: category1.id,
        date: '2024-01-01',
        userId: user.id
      });
      
      await createTransaction({
        description: `Transação ${user.name} 2`,
        amount: 200 * (parseInt(user.id.split('_')[2]) || 1),
        type: 'INCOME',
        categoryId: category2.id,
        date: '2024-01-02',
        userId: user.id
      });
      
      // Verificar que apenas os dados deste usuário são retornados
      const userCategories = await listCategories(user.id);
      const userTransactions = await listTransactions(user.id);
      
      if (userCategories.length !== 2) {
        throw new Error(`Usuário ${user.name} deveria ter 2 categorias, mas tem ${userCategories.length}`);
      }
      
      if (userTransactions.length !== 2) {
        throw new Error(`Usuário ${user.name} deveria ter 2 transações, mas tem ${userTransactions.length}`);
      }
      
      // Verificar que os dados pertencem ao usuário correto
      const allCategories = await db.getAllAsync('SELECT * FROM categories');
      const userCategoriesInDb = allCategories.filter(c => c.user_id === user.id);
      
      if (userCategoriesInDb.length !== 2) {
        throw new Error(`Banco de dados deveria ter 2 categorias para ${user.name}, mas tem ${userCategoriesInDb.length}`);
      }
    }
    
    this.log('  ✅ Teste de isolamento concluído com sucesso');
  }

  private async testConcurrentOperations(): Promise<void> {
    this.log('⚡ Testando operações concorrentes');
    
    const promises = this.users.slice(0, 10).map(async (user, index) => {
      resetDbCache(); // Simular dispositivos diferentes
      
      // Operações concorrentes
      const operations = [];
      
      for (let i = 0; i < 5; i++) {
        operations.push(
          createTransaction({
            description: `Concurrent ${user.name} ${i}`,
            amount: Math.random() * 1000,
            type: Math.random() > 0.5 ? 'INCOME' : 'EXPENSE',
            categoryId: 'default-category',
            date: '2024-01-01',
            userId: user.id
          })
        );
      }
      
      await Promise.all(operations);
      
      const transactions = await listTransactions(user.id);
      return { user: user.name, transactionCount: transactions.length };
    });
    
    const results = await Promise.all(promises);
    
    // Verificar se todos os usuários têm seus dados
    results.forEach(result => {
      if (result.transactionCount !== 5) {
        throw new Error(`${result.user} deveria ter 5 transações, mas tem ${result.transactionCount}`);
      }
    });
    
    this.log('  ✅ Teste de operações concorrentes concluído');
  }

  private async testBackupSystem(): Promise<void> {
    this.log('💾 Testando sistema de backup');
    
    // Testar backup para múltiplos usuários
    const backupPromises = this.users.slice(0, 5).map(async (user) => {
      resetDbCache();
      
      // Simular contexto do usuário
      const originalGetUserId = BackupSystem['getOrCreateDeviceId'];
      BackupSystem['getOrCreateDeviceId'] = async () => user.deviceId;
      
      try {
        const result = await BackupSystem.createBackup();
        return { user: user.name, success: result.success, backupId: result.backupId };
      } finally {
        BackupSystem['getOrCreateDeviceId'] = originalGetUserId;
      }
    });
    
    const backupResults = await Promise.all(backupPromises);
    
    backupResults.forEach(result => {
      if (!result.success) {
        throw new Error(`Backup falhou para ${result.user}`);
      }
    });
    
    // Testar listagem de backups
    const backups = await BackupSystem.listBackups();
    if (backups.length < 5) {
      throw new Error(`Deveria ter pelo menos 5 backups, mas tem ${backups.length}`);
    }
    
    // Verificar que backups são de usuários diferentes
    const uniqueUsers = new Set(backups.map(b => b.userId));
    if (uniqueUsers.size < 5) {
      throw new Error(`Backups deveriam ser de usuários diferentes`);
    }
    
    this.log('  ✅ Teste de sistema de backup concluído');
  }

  private async testSchedulerSystem(): Promise<void> {
    this.log('⏰ Testando sistema de agendamento');
    
    // Testar configuração do scheduler
    await BackupScheduler.saveConfig({
      enabled: true,
      backupTime: '03:00',
      requireWifi: false,
      requireCharging: false,
      maxRetries: 2,
      retryDelay: 15
    });
    
    const config = BackupScheduler.getConfig();
    if (config.backupTime !== '03:00' || config.maxRetries !== 2) {
      throw new Error('Configuração do scheduler não foi salva corretamente');
    }
    
    // Testar obtenção de estatísticas
    const stats = await BackupScheduler.getStats();
    if (!stats.config || typeof stats.config.enabled !== 'boolean') {
      throw new Error('Estatísticas do scheduler inválidas');
    }
    
    this.log('  ✅ Teste de sistema de agendamento concluído');
  }

  private async testDataIntegrity(): Promise<void> {
    this.log('🔒 Testando integridade dos dados');
    
    // Criar dados de teste
    const testUser = this.users[0];
    resetDbCache();
    
    const category = await createCategory({
      name: 'Categoria Integridade',
      color: '#ff00ff',
      icon: 'shield',
      userId: testUser.id
    });
    
    const transaction = await createTransaction({
      description: 'Transação Integridade',
      amount: 999.99,
      type: 'EXPENSE',
      categoryId: category.id,
      date: '2024-01-01',
      notes: 'Notas de teste para integridade',
      boletoNumber: '123456789',
      cnpj: '12.345.678/0001-90',
      recipientName: 'Empresa Teste',
      documentType: 'BOLETO',
      userId: testUser.id
    });
    
    // Criar backup
    const backupResult = await BackupSystem.createBackup();
    if (!backupResult.success) {
      throw new Error('Falha ao criar backup para teste de integridade');
    }
    
    // Modificar dados
    await createTransaction({
      description: 'Transação Modificada',
      amount: 1,
      type: 'INCOME',
      categoryId: category.id,
      date: '2024-01-02',
      userId: testUser.id
    });
    
    // Restaurar backup
    const fileName = `backup_${testUser.deviceId}_${backupResult.metadata?.createdAt.replace(/[:.]/g, '-')}.json`;
    const filePath = `${FileSystem.documentDirectory}backups/${fileName}`;
    
    const restoreResult = await BackupSystem.restoreBackup(filePath);
    if (!restoreResult.success) {
      throw new Error('Falha ao restaurar backup');
    }
    
    // Verificar integridade
    const transactions = await listTransactions(testUser.id);
    const originalTransaction = transactions.find(t => t.id === transaction.id);
    
    if (!originalTransaction) {
      throw new Error('Transação original não encontrada após restauração');
    }
    
    if (originalTransaction.amount !== 999.99 || originalTransaction.boletoNumber !== '123456789') {
      throw new Error('Dados da transação foram corrompidos durante backup/restauração');
    }
    
    if (transactions.length !== 1) {
      throw new Error(`Deveria ter 1 transação após restauração, mas tem ${transactions.length}`);
    }
    
    this.log('  ✅ Teste de integridade de dados concluído');
  }

  private async testPerformance(): Promise<void> {
    this.log('🚀 Testando performance com múltiplos usuários');
    
    const startTime = Date.now();
    
    // Criar dados para todos os 20 usuários simultaneamente
    const performancePromises = this.users.map(async (user, index) => {
      resetDbCache();
      
      const userStartTime = Date.now();
      
      // Criar 10 categorias
      const categoryPromises = [];
      for (let i = 0; i < 10; i++) {
        categoryPromises.push(
          createCategory({
            name: `Cat ${user.name} ${i}`,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
            icon: 'tag',
            userId: user.id
          })
        );
      }
      
      const categories = await Promise.all(categoryPromises);
      
      // Criar 50 transações
      const transactionPromises = [];
      for (let i = 0; i < 50; i++) {
        transactionPromises.push(
          createTransaction({
            description: `Trans ${user.name} ${i}`,
            amount: Math.random() * 1000,
            type: Math.random() > 0.5 ? 'INCOME' : 'EXPENSE',
            categoryId: categories[i % categories.length].id,
            date: `2024-01-${((i % 28) + 1).toString().padStart(2, '0')}`,
            userId: user.id
          })
        );
      }
      
      await Promise.all(transactionPromises);
      
      const userEndTime = Date.now();
      
      return {
        user: user.name,
        duration: userEndTime - userStartTime,
        categories: categories.length,
        transactions: 50
      };
    });
    
    const results = await Promise.all(performancePromises);
    const totalTime = Date.now() - startTime;
    
    // Verificar performance
    const avgUserTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const totalOperations = results.reduce((sum, r) => sum + r.categories + r.transactions, 0);
    
    this.log(`  📊 Performance: ${totalTime}ms total, ${avgUserTime.toFixed(2)}ms por usuário`);
    this.log(`  📊 Operações: ${totalOperations} operações em ${totalTime}ms`);
    this.log(`  📊 Throughput: ${(totalOperations / (totalTime / 1000)).toFixed(2)} ops/seg`);
    
    // Verificar limites de performance
    if (avgUserTime > 5000) { // 5 segundos por usuário
      throw new Error(`Performance abaixo do esperado: ${avgUserTime}ms por usuário`);
    }
    
    if (totalTime > 30000) { // 30 segundos total
      throw new Error(`Performance total abaixo do esperado: ${totalTime}ms`);
    }
    
    this.log('  ✅ Teste de performance concluído com sucesso');
  }

  private generateReport(): void {
    this.log('📊 Gerando relatório final');
    
    const report = {
      timestamp: new Date().toISOString(),
      testUsers: this.users.length,
      totalTests: this.testResults.length,
      results: this.testResults,
      summary: {
        userIsolation: '✅ Passou',
        concurrentOperations: '✅ Passou',
        backupSystem: '✅ Passou',
        schedulerSystem: '✅ Passou',
        dataIntegrity: '✅ Passou',
        performance: '✅ Passou'
      }
    };
    
    // Salvar relatório em arquivo
    const reportPath = './test-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log(`📄 Relatório salvo em: ${reportPath}`);
    console.log(`👥 Usuários testados: ${this.users.length}`);
    console.log(`🧪 Testes executados: ${this.testResults.length}`);
    
    console.log('\n📋 Resumo:');
    Object.entries(report.summary).forEach(([test, result]) => {
      console.log(`  ${result} ${test}`);
    });
  }
}

// Executar testes
async function main() {
  const tester = new MultiUserTester();
  
  try {
    await tester.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('❌ Testes falharam:', error);
    process.exit(1);
  }
}

// Exportar para uso em outros scripts
export { MultiUserTester };

// Executar se chamado diretamente
if (require.main === module) {
  main();
}
