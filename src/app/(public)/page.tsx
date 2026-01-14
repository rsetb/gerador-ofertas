

'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Product, Category } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import ProductFilters from '@/components/ProductFilters';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FilterSheet from '@/components/FilterSheet';
import { useData } from '@/context/DataContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/context/CartContext';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
};


export default function Home() {
  const { products: allProducts, categories, isLoading } = useData();
  const { headerSearch, setHeaderSearch } = useCart();

  const [filters, setFilters] = useState({
    category: 'all',
    subcategory: 'all',
    search: '',
    sort: 'newest',
  });

  useEffect(() => {
    if (headerSearch) {
      setFilters(prev => ({...prev, search: headerSearch}));
    }
  }, [headerSearch]);

  const handleFilterChange = (
    newFilters: Partial<typeof filters>
  ) => {
    setFilters((prevFilters) => {
        const updated = { ...prevFilters, ...newFilters };
        // Reset subcategory if parent category changes
        if (newFilters.category && newFilters.category !== prevFilters.category) {
            updated.subcategory = 'all';
        }
        return updated;
    });
    // When filters are changed from the filter components, clear the header search
    if (newFilters.search !== undefined) {
      setHeaderSearch(newFilters.search);
    }
  };

  const saleProducts = useMemo(() => {
    return allProducts.filter(p => p.onSale && !p.isHidden);
  }, [allProducts]);

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = [...allProducts].filter(p => !p.isHidden);

    if (filters.category !== 'all') {
      filtered = filtered.filter((p) => p.category === filters.category);
    }
    
    if (filters.subcategory !== 'all') {
        filtered = filtered.filter((p) => p.subcategory === filters.subcategory);
    }

    if (filters.search) {
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    
    // Split into available and unavailable
    const available = filtered.filter(p => p.stock > 0);
    const unavailable = filtered.filter(p => p.stock <= 0);

    const sortArray = (arr: Product[]) => {
        switch (filters.sort) {
        case 'price-asc':
            arr.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            arr.sort((a, b) => b.price - a.price);
            break;
        case 'newest':
            arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            break;
        default: // relevance
            // No specific relevance logic, using default order
            break;
        }
        return arr;
    }

    // Sort each array individually and then concatenate
    return [...sortArray(available), ...sortArray(unavailable)];

  }, [filters, allProducts]);

  const ProductGridSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {Array.from({length: 8}).map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
                <Skeleton className="h-[250px] w-full rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
        ))}
    </div>
  );

  return (
    <>
      <FilterSheet 
        categories={categories}
        onFilterChange={handleFilterChange}
        currentFilters={filters}
      />
      {saleProducts.length > 0 && (
        <section className="w-full bg-muted/50">
            <div className="container mx-auto py-8">
              <Carousel
                opts={{
                  align: "start",
                  loop: true,
                }}
                className="w-full"
              >
                <CarouselContent>
                  {saleProducts.map((product) => (
                    <CarouselItem
                      key={product.id}
                      className={
                        saleProducts.length === 1
                          ? 'basis-full'
                          : saleProducts.length === 2
                            ? 'md:basis-1/2 lg:basis-1/2'
                            : 'md:basis-1/2 lg:basis-1/3'
                      }
                    >
                      <div className="p-1 h-full">
                        <Link href={`/produtos/${product.id}`} className="block h-full">
                          <Card className="h-full overflow-hidden flex flex-col md:flex-row justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <CardContent className="flex flex-col md:flex-row items-center text-center md:text-left p-6 gap-4">
                               <div className="relative w-40 h-40 md:w-48 md:h-48 flex-shrink-0">
                                <Badge className="absolute top-0 left-0 z-10 bg-destructive text-destructive-foreground hover:bg-destructive/80">
                                  Promoção
                                </Badge>
                                <Image
                                  src={(product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : 'https://placehold.co/400x400.png'}
                                  alt={product.name}
                                  fill
                                  className="object-contain"
                                  sizes="50vw"
                                />
                              </div>
                              <div className="flex flex-col justify-between flex-grow">
                                <div>
                                    <h3 className="text-xl font-bold leading-tight min-h-[56px]">{product.name}</h3>
                                    <p className="text-muted-foreground text-sm mt-1 mb-3 h-10 overflow-hidden">{product.description}</p>
                                </div>
                                <div className="mt-auto">
                                  {typeof product.originalPrice === 'number' && product.originalPrice > product.price && (
                                    <p className="text-sm text-muted-foreground line-through">{formatCurrency(product.originalPrice)}</p>
                                  )}
                                  <p className="text-3xl font-bold text-accent">{formatCurrency(product.price)}</p>
                                  <Button className="mt-3 w-full md:w-auto">Ver Detalhes</Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4" />
                <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4" />
              </Carousel>
            </div>
        </section>
      )}

      <div id="catalog" className="container mx-auto px-4 py-8">
        <ProductFilters
            onFilterChange={handleFilterChange}
            categories={categories}
            currentFilters={filters}
        />
        
        {isLoading ? (
            <ProductGridSkeleton />
        ) : filteredAndSortedProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredAndSortedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        )}
      </div>
    </>
  );
}
