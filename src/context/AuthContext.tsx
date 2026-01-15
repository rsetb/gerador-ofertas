
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { User, UserRole } from '@/lib/types';
import { getClientFirebase } from '@/lib/firebase-client';
import { collection, doc, getDocs, setDoc, updateDoc, writeBatch, query, where, getDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAudit } from './AuditContext';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

// NOTE: In a real application, passwords should be hashed and stored securely in a database.
// This is for prototype purposes only.
const initialUsers: User[] = [
  { id: 'user-1', username: 'admin', password: 'adminpassword', name: 'Administrador', role: 'admin', canBeAssigned: true },
  { id: 'user-2', username: 'gerente', password: 'gerentepassword', name: 'Gerente Loja', role: 'gerente', canBeAssigned: true },
  { id: 'user-3', username: 'vendedor', password: 'vendedorpassword', name: 'Vendedor Teste', role: 'vendedor', canBeAssigned: true },
];

interface AuthContextType {
  user: User | null;
  users: User[];
  login: (user: string, pass: string) => void;
  logout: () => void;
  addUser: (data: Omit<User, 'id'>) => Promise<boolean>;
  updateUser: (userId: string, data: Partial<Omit<User, 'id'>>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  changeMyPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  isLoading: boolean;
  isAuthenticated: boolean;
  restoreUsers: (users: User[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const { logAction } = useAudit();
  
  useEffect(() => {
    setIsLoading(true);
    const { db } = getClientFirebase();

    const usersSeededRef = doc(db, 'config', 'usersSeeded');
    let isUsersSeeded: boolean | null = null;
    let isSeeding = false;

    const usersUnsubscribe = onSnapshot(collection(db, 'users'), async (snapshot) => {
        if (isUsersSeeded === null) {
          try {
            const seededSnap = await getDoc(usersSeededRef);
            isUsersSeeded = seededSnap.exists();
          } catch {
            isUsersSeeded = true;
          }
        }

        if (snapshot.empty) {
          setUsers([]);
          if (isUsersSeeded || isSeeding) return;

          isSeeding = true;
          try {
            const batch = writeBatch(db);
            initialUsers.forEach(u => {
              batch.set(doc(db, 'users', u.id), u);
            });
            await batch.commit();
            await setDoc(usersSeededRef, { seededAt: new Date().toISOString() }, { merge: true });
            isUsersSeeded = true;
          } finally {
            isSeeding = false;
          }
          return;
        }

        const mappedUsers = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as User));
        setUsers(mappedUsers);

        const initialPasswordById = new Map<string, string>();
        initialUsers.forEach((u) => {
          if (u.password) initialPasswordById.set(u.id, u.password);
        });

        const missingPassword = mappedUsers.filter((u) => !u.password && initialPasswordById.has(u.id));
        if (missingPassword.length > 0) {
          await Promise.all(
            missingPassword.map((u) =>
              updateDoc(doc(db, 'users', u.id), { password: initialPasswordById.get(u.id) }).catch(() => {})
            )
          );
        }
        if (!isUsersSeeded) {
          try {
            await setDoc(usersSeededRef, { seededAt: new Date().toISOString() }, { merge: true });
            isUsersSeeded = true;
          } catch {
          }
        }
    },
    (error) => {
      console.error("Error fetching users:", error);
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'users',
        operation: 'list',
      }));
    });
    
    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    } catch (error) {
        console.error("Failed to read user from localStorage", error);
        localStorage.removeItem('user');
    } finally {
        setIsLoading(false);
    }
    
    return () => usersUnsubscribe();
  }, []);

  const login = (username: string, pass: string) => {
    const foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!foundUser) {
        toast({ title: 'Falha no Login', description: 'Usuário não encontrado.', variant: 'destructive' });
        return;
    }

    if (!foundUser.password) {
        toast({ title: 'Falha no Login', description: 'Usuário sem senha cadastrada.', variant: 'destructive' });
        return;
    }
    
    // In a real app, this would be a hashed password comparison
    const isPasswordValid = foundUser.password === pass;
    if (isPasswordValid) {
        const userToStore = { ...foundUser };
        // Ensure password is not stored in state or localStorage for security
        delete userToStore.password;
        
        setUser(userToStore); 
        localStorage.setItem('user', JSON.stringify(userToStore));
        logAction('Login', `Usuário "${foundUser.name}" realizou login.`, userToStore);
        router.push('/admin');
        toast({
            title: 'Login bem-sucedido!',
            description: `Bem-vindo(a), ${foundUser.name}.`,
        });
    } else {
        toast({
            title: 'Falha no Login',
            description: 'Senha inválida.',
            variant: 'destructive',
        });
    }
  };

  const logout = () => {
    if (user) {
        logAction('Logout', `Usuário "${user.name}" realizou logout.`, user);
    }
    setUser(null);
    localStorage.removeItem('user');
    router.push('/login');
  };

  const addUser = async (data: Omit<User, 'id'>): Promise<boolean> => {
    const { db } = getClientFirebase();
    const isUsernameTaken = users.some(u => u.username.toLowerCase() === data.username.toLowerCase());
    if (isUsernameTaken) {
        toast({
            title: 'Erro ao Criar Usuário',
            description: 'Este nome de usuário já está em uso.',
            variant: 'destructive',
        });
        return false;
    }

    const newUserId = `user-${Date.now()}`;
    const newUser: User = { ...data, canBeAssigned: data.canBeAssigned ?? true, id: newUserId };
    
    const userRef = doc(db, 'users', newUserId);
    try {
        await setDoc(userRef, newUser);
        setUsers((prev) => [...prev, newUser]);
        logAction('Criação de Usuário', `Novo usuário "${data.name}" (Perfil: ${data.role}) foi criado.`, user);
        toast({
            title: 'Usuário Criado!',
            description: `O usuário ${data.name} foi criado com sucesso.`,
        });
        return true;
    } catch (error: any) {
        if (error?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: userRef.path,
                operation: 'create',
                requestResourceData: newUser
            }));
        }
        toast({
            title: 'Erro ao Criar Usuário',
            description: 'Não foi possível salvar o novo usuário.',
            variant: 'destructive',
        });
        return false;
    }
  };

  const updateUser = async (userId: string, data: Partial<Omit<User, 'id'>>) => {
    const { db } = getClientFirebase();
    if (data.username) {
        const isUsernameTaken = users.some(u => u.id !== userId && u.username.toLowerCase() === data.username?.toLowerCase());
        if (isUsernameTaken) {
            toast({
                title: 'Erro ao Atualizar',
                description: 'Este nome de usuário já está em uso por outra conta.',
                variant: 'destructive',
            });
            return;
        }
    }
    
    const userRef = doc(db, 'users', userId);
    
    const updatedUser = users.find(u => u.id === userId);
    if (updatedUser) {
        let details = `Dados do usuário "${updatedUser.name}" foram alterados.`;
        if (data.name && data.name !== updatedUser.name) {
            details += ` Nome: de "${updatedUser.name}" para "${data.name}".`
        }
        if (data.username && data.username !== updatedUser.username) {
            details += ` Username: de "${updatedUser.username}" para "${data.username}".`
        }
         if (data.role && data.role !== updatedUser.role) {
            details += ` Perfil: de "${updatedUser.role}" para "${data.role}".`
        }
        if (data.password) {
            details += ' Senha foi alterada.';
        }
        if (data.canBeAssigned !== undefined && data.canBeAssigned !== updatedUser.canBeAssigned) {
            details += ` Atribuível em vendas: de "${updatedUser.canBeAssigned ?? true}" para "${data.canBeAssigned}".`;
        }
        logAction('Atualização de Usuário', details, user);
    }
    
    try {
        await updateDoc(userRef, data);

        setUsers((prev) => prev.map((u) => (u.id === userId ? ({ ...u, ...data } as User) : u)));

        if (user?.id === userId) {
            const updatedCurrentUser = { ...user, ...data };
            delete updatedCurrentUser.password;
            setUser(updatedCurrentUser);
            localStorage.setItem('user', JSON.stringify(updatedCurrentUser));
        }

        toast({
            title: 'Usuário Atualizado!',
            description: 'As informações do usuário foram salvas com sucesso.',
        });
    } catch (error: any) {
        if (error?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: userRef.path,
                operation: 'update',
                requestResourceData: data
            }));
        }
        toast({
            title: 'Erro ao Atualizar',
            description: 'Não foi possível salvar as alterações do usuário.',
            variant: 'destructive',
        });
        throw error;
    }
  };

  const deleteUser = async (userId: string) => {
    if (user?.id === userId) {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode excluir seu próprio usuário.',
        variant: 'destructive',
      });
      return;
    }
    const { db } = getClientFirebase();
    const userRef = doc(db, 'users', userId);
    const userToDelete = users.find(u => u.id === userId);

    try {
      await deleteDoc(userRef);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (userToDelete) {
        logAction('Exclusão de Usuário', `Usuário "${userToDelete.name}" foi excluído.`, user);
      }
      toast({
        title: 'Usuário Excluído!',
        description: 'O usuário foi removido do sistema.',
        variant: 'destructive',
        duration: 5000,
      });
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: userRef.path,
          operation: 'delete',
        }));
      }
      toast({
        title: 'Erro ao Excluir',
        description: 'Não foi possível excluir o usuário.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      const { db } = getClientFirebase();
      if (!user) {
          toast({ title: "Erro", description: "Você não está logado.", variant: "destructive" });
          return false;
      }
      
      const currentUserInDB = users.find(u => u.id === user.id);
      
      if (!currentUserInDB || currentUserInDB.password !== currentPassword) {
          toast({ title: "Erro", description: "A senha atual está incorreta.", variant: "destructive" });
          return false;
      }

      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { password: newPassword });
      logAction('Alteração de Senha', `O usuário "${user.name}" alterou a própria senha.`, user);
      toast({ title: "Senha Alterada!", description: "Sua senha foi atualizada com sucesso." });
      return true;
  };
  
  const restoreUsers = async (usersToRestore: User[]) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    
    users.forEach(existingUser => {
        batch.delete(doc(db, 'users', existingUser.id));
    });

    usersToRestore.forEach(u => {
        const docRef = doc(db, 'users', u.id);
        batch.set(docRef, u);
    });

    batch.commit().then(() => {
        logAction('Restauração de Usuários', 'Todos os usuários foram restaurados a partir de um backup.', user);
        toast({ title: "Usuários Restaurados!", description: "A lista de usuários foi substituída com sucesso." });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'users',
            operation: 'write'
        }));
    });
  };

  return (
    <AuthContext.Provider value={{ user, users, login, logout, addUser, updateUser, deleteUser, changeMyPassword, isLoading, isAuthenticated: !!user, restoreUsers }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
