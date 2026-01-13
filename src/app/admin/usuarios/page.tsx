
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Edit, Users, KeyRound, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { User, UserRole } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const userEditFormSchema = z.object({
    name: z.string().min(3, 'O nome é obrigatório.'),
    username: z.string().min(3, 'O nome de usuário é obrigatório.'),
    role: z.enum(['admin', 'gerente', 'vendedor', 'vendedor_externo'], { required_error: 'O perfil é obrigatório.' }),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  }).refine(data => {
    if (data.password && data.password.length < 6) {
        return false;
    }
    return true;
  }, {
    message: 'A senha deve ter pelo menos 6 caracteres.',
    path: ['password'],
  }).refine(data => data.password === data.confirmPassword, {
    message: 'As senhas não correspondem.',
    path: ['confirmPassword'],
});

const userCreateFormSchema = z.object({
    name: z.string().min(3, 'O nome é obrigatório.'),
    username: z.string().min(3, 'O nome de usuário é obrigatório.'),
    role: z.enum(['admin', 'gerente', 'vendedor', 'vendedor_externo'], { required_error: 'O perfil é obrigatório.' }),
    password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: 'As senhas não correspondem.',
    path: ['confirmPassword'],
});


export default function ManageUsersPage() {
    const { user: currentUser, users, updateUser, addUser, deleteUser, isLoading: isAuthLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);

    const editForm = useForm<z.infer<typeof userEditFormSchema>>({
        resolver: zodResolver(userEditFormSchema),
    });

    const createForm = useForm<z.infer<typeof userCreateFormSchema>>({
        resolver: zodResolver(userCreateFormSchema),
        defaultValues: {
            name: '',
            username: '',
            password: '',
            confirmPassword: '',
            role: 'vendedor',
        }
    });

    const getRoleLabel = (role: UserRole) => {
        switch (role) {
            case 'admin':
                return 'Admin';
            case 'gerente':
                return 'Gerente';
            case 'vendedor':
                return 'Vendedor';
            case 'vendedor_externo':
                return 'Vendedor Externo';
            default:
                return role;
        }
    };

    const handleOpenEditDialog = (user: User) => {
        setUserToEdit(user);
        editForm.reset({ 
            name: user.name, 
            username: user.username,
            role: user.role,
            password: '', 
            confirmPassword: '' 
        });
        setIsEditDialogOpen(true);
    };

    const handleEditUser = async (values: z.infer<typeof userEditFormSchema>) => {
        if (!userToEdit) return;
        
        const dataToUpdate: Partial<User> = { 
            name: values.name,
            username: values.username,
            role: values.role,
         };
        if (values.password) {
            dataToUpdate.password = values.password;
        }

        await updateUser(userToEdit.id, dataToUpdate);
        setIsEditDialogOpen(false);
    };

    const handleCreateUser = async (values: z.infer<typeof userCreateFormSchema>) => {
        const { confirmPassword, ...userData } = values;
        const success = await addUser(userData);

        if (success) {
            createForm.reset();
            setIsAddDialogOpen(false);
        }
    }
    
    if (isAuthLoading) {
        return (
            <div className="flex justify-center items-center py-24">
                <p>Verificando permissões...</p>
            </div>
        );
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-6 w-6" /> Gerenciar Usuários
                        </CardTitle>
                        <CardDescription>Crie, edite as informações e senhas dos usuários do sistema.</CardDescription>
                    </div>
                     <Button onClick={() => setIsAddDialogOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Criar Usuário
                    </Button>
                </CardHeader>
                <CardContent>
                     <div className="rounded-md border">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Perfil</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users && users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell>{user.username}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{getRoleLabel(user.role)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-2 justify-end">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(user)}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Editar
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" outline size="sm" disabled={currentUser?.id === user.id}>
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Excluir
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirmar Exclusão?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta ação não pode ser desfeita. Isso irá apagar permanentemente o usuário <span className="font-bold">{user.name}</span>.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => deleteUser(user.id)}>
                                                                Sim, Excluir
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Criar Novo Usuário</DialogTitle>
                        <DialogDescription>
                            Preencha os dados para criar um novo acesso ao sistema.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4 py-4">
                            <FormField
                                control={createForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome Completo</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="username"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome de Usuário</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <div className="grid grid-cols-1 gap-4">
                                <FormField
                                control={createForm.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Perfil de Acesso</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um perfil" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="vendedor">Vendedor</SelectItem>
                                            <SelectItem value="gerente">Gerente</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            </div>
                            <FormField
                                control={createForm.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Senha</FormLabel>
                                        <FormControl><Input type="password" placeholder="Mínimo 6 caracteres" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Confirmar Senha</FormLabel>
                                        <FormControl><Input type="password" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit">Criar Usuário</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Editar Usuário</DialogTitle>
                        <DialogDescription>
                            Altere o nome, perfil ou defina uma nova senha para <span className="font-bold">{userToEdit?.username}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleEditUser)} className="space-y-6 py-4">
                            <div className="grid grid-cols-1 gap-4">
                                <FormField
                                    control={editForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="username"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome de Usuário (Login)</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={editForm.control}
                                    name="role"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Perfil de Acesso</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={currentUser?.id === userToEdit?.id}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um perfil" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="vendedor">Vendedor</SelectItem>
                                                <SelectItem value="vendedor_externo">Vendedor Externo</SelectItem>
                                                <SelectItem value="gerente">Gerente</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="space-y-2 pt-4 border-t">
                                 <p className="text-sm font-medium text-muted-foreground flex items-center gap-2"><KeyRound className="h-4 w-4" /> Alterar Senha (Opcional)</p>
                                <FormField
                                    control={editForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nova Senha</FormLabel>
                                            <FormControl>
                                                <Input type="password" placeholder="Mínimo 6 caracteres" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Confirmar Nova Senha</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit">Salvar Alterações</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}
